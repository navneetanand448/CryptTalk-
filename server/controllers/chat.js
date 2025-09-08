import {
  ALERT,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  REFETCH_CHATS,
} from "../constants/events.js";
import { errorMiddleware, TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "./../models/chat.js";
import { User } from "../models/user.js";
import {
  deleteFilesFromCloudinary,
  emitEvent,
  uploadFilesToCloudinary,
} from "../utils/features.js";
import { get } from "mongoose";
import { Message } from "../models/message.js";

const newGroupChat = TryCatch(async (req, res, next) => {
  const { name, members } = req.body;
  if (members.length < 2)
    return next(new ErrorHandler("Group must have ateast 3 members", 400));
  const allMembers = [...members, req.user];
  await Chat.create({
    name,
    groupChat: true,
    creator: req.user,
    members: allMembers,
  });
  emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);
  emitEvent(req, REFETCH_CHATS, members);

  return res.status(201).json({
    success: true,
    message: "Group created successfully",
  });
});

const getMyChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({ members: req.user }).populate(
    "members",
    "name avatar publicKey" // Added publicKey to the fields to populate
  );

  const getOtherMembers = (members, userId) => {
    return members.find(
      (member) => member._id.toString() !== userId.toString()
    );
  };

  const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
    const otherMember = getOtherMembers(members, req.user);
    return {
      _id,
      groupChat,
      name: groupChat ? name : otherMember.name,
      avatar: groupChat
        ? members.slice(0, 3).map(({ avatar }) => avatar.url)
        : [otherMember.avatar.url],
      members: members.reduce((prev, cur) => {
        if (cur._id.toString() !== req.user.toString()) {
          prev.push({
            _id: cur._id,
            publicKey: cur.publicKey 
          });
        }
        return prev;
      }, []),
      otherMemberPublicKey: groupChat ? null : otherMember.publicKey,
    };
  });
  
  return res.status(200).json({
    success: true,
    chats: transformedChats,
  });
});


// const getMyChats = TryCatch(async (req, res, next) => {
//   const chats = await Chat.find({ members: req.user }).populate(
//     "members",
//     "name avatar"
//   );

//   const getOtherMembers = (memebers, userId) => {
//     return memebers.find(
//       (members) => members._id.toString() !== userId.toString()
//     );
//   };

//   const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
//     const otherMember = getOtherMembers(members, req.user);
//     return {
//       _id,
//       groupChat,
//       name: groupChat ? name : otherMember.name,
//       avatar: groupChat
//         ? members.slice(0, 3).map(({ avatar }) => avatar.url)
//         : [otherMember.avatar.url],
//       members: members.reduce((prev, cur) => {
//         if (cur._id.toString() !== req.user.toString()) {
//           prev.push(cur._id);
//         }
//         return prev;
//       }, []),
//       otherMemberPublicKey: groupChat ? null : otherMember.publicKey,
//     };
//   });
//   return res.status(200).json({
//     success: true,
//     chats: transformedChats,
//   });
// });

const getMyGroups = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({
    members: req.user,
    groupChat: true,
    creator: req.user,
  }).populate("members", "name avatar");

  const groups = chats.map(({ members, _id, groupChat, name }) => ({
    _id,
    groupChat,
    name,
    avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
  }));

  return res.status(200).json({
    success: true,
    groups,
  });
});

const addMembers = TryCatch(async (req, res, next) => {
  const { chatId, members } = req.body;

  if (!members || members.length < 1)
    return next(new ErrorHandler("please provide members", 400));

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  const allNewMembersPromise = members.map((i) => User.findById(i, "name"));

  const allNewMembers = await Promise.all(allNewMembersPromise);

  const uniqueMembers = allNewMembers
    .filter((i) => !chat.members.includes(i._id.toString()))
    .map((i) => i._id);

  chat.members.push(...uniqueMembers);

  if (chat.members.length > 100)
    return next(new ErrorHandler("Group members limit reached", 400));

  await chat.save();

  const allUsersName = allNewMembers.map((i) => i.name).join(", ");

  emitEvent(
    req,
    ALERT,
    chat.members,
    `${allUsersName} has been added in the group`
  );

  emitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "Members added successfully",
  });
});

const removeMember = TryCatch(async (req, res, next) => {
  const { userId, chatId } = req.body;

  const [chat, userThatWillBeRemoved] = await Promise.all([
    Chat.findById(chatId),
    User.findById(userId, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  if (chat.members.length <= 3)
    return next(new ErrorHandler("Group must have at least 3 members", 400));

  const allChatMembers = chat.members.map((i) => i.toString());

  chat.members = chat.members.filter(
    (member) => member.toString() !== userId.toString()
  );

  await chat.save();

  emitEvent(req, ALERT, chat.members, {
    message: `${userThatWillBeRemoved.name} has been removed from the group`,
    chatId,
  });

  emitEvent(req, REFETCH_CHATS, allChatMembers);

  return res.status(200).json({
    success: true,
    message: "Member removed successfully",
  });
});

const leaveGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  const remainingMembers = chat.members.filter(
    (member) => member.toString() !== req.user.toString()
  );

  //assign groupAdmin if, previous group admin has left the group
  if (chat.creator.toString() === req.user.toString()) {
    const newCreator = remainingMembers[0];
    chat.creator = newCreator;
  }

  chat.members = remainingMembers;

  const [user] = await Promise.all([
    User.findById(req.user, "name"),
    chat.save(),
  ]);
  emitEvent(req, ALERT, chat.members, {
    chatId,
    message: `User ${user.name} has left the group`,
  });

  return res.status(200).json({
    success: true,
    message: "Member left successfully",
  });
});

const sendAttachments = TryCatch(async (req, res, next) => {
  const { chatId } = req.body;
  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  const files = req.files || [];

  if (files.length < 1) return next(new ErrorHandler("No files attached", 400));

  if (files.length > 5)
    return next(new ErrorHandler("files can not be more than 5", 400));

  const attachments = await uploadFilesToCloudinary(files);
  const messageForDB = {
    content: "",
    encryptedContent: "",
    attachments,
    sender: me._id,
    chat: chatId,
  };

  const messageForRealTime = {
    ...messageForDB,
    sender: {
      _id: me._id,
      name: me.name,
    },
  };

  const message = await Message.create(messageForDB);

  emitEvent(req, NEW_MESSAGE, chat.members, {
    message: messageForRealTime,
    chatId,
  });

  emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });

  return res.status(200).json({
    success: true,
    message,
  });
});

const getChatDetails = TryCatch(async (req, res, next) => {

  // console.log(req.query.populate, "here in chat details")
  if (req.query.populate === "true") {
    const chat = await Chat.findById(req.params.id)
      .populate("members", "name avatar publicKey")
      .lean();

    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    chat.members = chat.members.map(({ _id, name, avatar, publicKey }) => ({
      _id,
      name,
      avatar: avatar?.url,
      publicKey,
    }));
    // console.log(chat, "here in chat details")
    return res.status(200).json({
      success: true,
      chat,
    });
  } else {
    const chat = await Chat.findById(req.params.id);

    if (!chat) return next(new ErrorHandler("Chat not found", 404));
    // console.log(chat, "here")
    return res.status(200).json({
      success: true,
      chat,
    });
  } 
});

const renameGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { name } = req.body;
  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));
  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(
      new ErrorHandler("you are not allowed to rename the group", 403)
    );

  chat.name = name;
  await chat.save();
  emitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "group renamed successfully",
  });
});

const deleteChat = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  const members = chat.members;

  if (chat.groupChat && chat.creator.toString() != req.user.toString())
    return next(
      new ErrorHandler("You are not allowed to delete the group", 403)
    );

  if (!chat.groupChat && !chat.members.includes(req.user.toString()))
    return next(
      new ErrorHandler("You are not allowed to delete the chat", 403)
    );

  //cloudinary wala kaam

  const messagesWithAttachments = await Message.find({
    chat: chatId,
    attachments: { $exists: true, $ne: [] },
  });

  const public_ids = [];

  messagesWithAttachments.forEach(({ attachments }) => {
    attachments.forEach(({ public_id }) => public_ids.push(public_id));
  });

  await Promise.all([
    deleteFilesFromCloudinary(public_ids),
    chat.deleteOne(),
    Message.deleteMany({ chat: chatId }),
  ]);

  emitEvent(req, REFETCH_CHATS, members);

  return res.status(200).json({
    success: true,
    message: "chat deleted successfully",
  });
});

const getMessages = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { page = 1 } = req.query;
  const resultPerPage = 20;
  const skip = (page - 1) * resultPerPage;
  const chat = await Chat.findById(chatId).populate("members", "name publicKey");
  if (!chat) return next(new ErrorHandler("Chat not found!", 404));
  if (!chat.members.some(member => member._id.toString() === req.user.toString()))
    return next(new ErrorHandler("Not authorized to access this chat!", 403));
  const [messages, totalMessagesCount] = await Promise.all([
    Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(resultPerPage)
      .populate("sender", "name publicKey")
      .lean(),
    Message.countDocuments({ chat: chatId }),
  ]);

  // For encrypted messages, include encrypted content and receiver details
  const processedMessages = messages.map(msg => {
    const receivers = chat.members
      .filter(member => member._id.toString() !== msg.sender._id.toString())
      .map(member => ({
        _id: member._id,
        name: member.name,
        publicKey: member.publicKey
      }));
    return {
      ...msg,
      content: msg.encryptedContent || msg.content, // Return encrypted content for decryption on client
      sender: {
        _id: msg.sender._id,
        name: msg.sender.name,
        publicKey: msg.sender.publicKey
      },
      receiver: receivers // Add receiver array with _id, name, and publicKey
    };
  });

  const totalPages = Math.ceil(totalMessagesCount / resultPerPage) || 0;
  // console.log(processedMessages)
  return res.status(200).json({
    success: true,
    message: processedMessages.reverse(),
    totalPages,
  });
});

export {
  newGroupChat,
  getMyChats,
  getMyGroups,
  addMembers,
  removeMember,
  leaveGroup,
  sendAttachments,
  getChatDetails,
  renameGroup,
  deleteChat,
  getMessages,
};
