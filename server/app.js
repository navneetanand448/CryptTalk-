import express from "express";
import { connectDB } from "./utils/features.js";
import { configDotenv } from "dotenv";
import { errorMiddleware } from "./middlewares/error.js";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { createServer } from "http";
import {
  CHAT_JOINED,
  CHAT_LEAVED,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  ONLINE_USERS,
  START_TYPING,
  STOP_TYPING,
} from "./constants/events.js";
import { v4 as uuid } from "uuid";
import { getSockets } from "./lib/helper.js";
import { Message } from "./models/message.js";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { socketAuthenticator } from "./middlewares/auth.js";
import fs from "fs";
import path from "path";

import userRoute from "./routes/user.js";
import chatRoute from "./routes/chat.js";

configDotenv({
  path: "./.env",
});
const mongoURI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const userSocketIDs = new Map();
const onlineUsers = new Set();
connectDB(mongoURI);

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const app = express();

const server = createServer(app);

const corseOption = {
  origin: "https://crypt-front.vercel.app", 
  credentials: true, 
};

const io = new Server(server, {
  cors: corseOption,
});
console.log(corseOption);

app.set("io", io);

// ------------------- CUSTOM LOGGING -------------------
const logFile =
  process.env.VERCEL === "1"
    ? "/tmp/requests.log"
    : path.join(process.cwd(), "requests.log");

const originalLog = console.log;
console.log = function (...args) {
  const message = args.map(a =>
    typeof a === "object" ? JSON.stringify(a) : String(a)
  ).join(" ");
  const logLine = `[${new Date().toISOString()}] ${message}\n`;

  fs.appendFileSync(logFile, logLine, "utf8"); // write to file
  originalLog.apply(console, args); // keep normal console.log
};

//using midddlewares here
app.use(express.json());
app.use(cookieParser());
app.use(cors(corseOption));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);

// ------------------- LOG VIEW ROUTE -------------------
app.get("/", (req, res) => {
  fs.readFile(logFile, "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Could not read logs");
    }
    res.send(`<pre>${data}</pre>`);
  });
});
// ------------------------------------------------------

io.use((socket, next) => {
  cookieParser()(socket.request, socket.request.res, async (err) => {
    await socketAuthenticator(err, socket, next);
  });
});

io.on("connection", (socket) => {
  const user = socket.user;
  userSocketIDs.set(user._id.toString(), socket.id);

  socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
    const recipients = members
      .filter(member => member._id !== user._id.toString())
      .map(member => `${member.name} (ID: ${member._id})`);
    console.log(`Message from ${user.name} (ID: ${user._id}) to chat ${chatId} (Recipients: ${recipients.join(", ")}): ${message || message}`);

    const messageForRealTime = {
      content: message, 
      _id: uuid(),
      sender: {
        _id: user._id,
        name: user.name,
      },
      chat: chatId,
      createdAt: new Date().toISOString(),
    };

    const messageForDB = {
      content: message, 
      encryptedContent: message, 
      sender: user._id,
      chat: chatId,
    };

    const membersSocket = getSockets(members);

    io.to(membersSocket).emit(NEW_MESSAGE, {
      chatId,
      message: messageForRealTime,
    });

    io.to(membersSocket).emit(NEW_MESSAGE_ALERT, {
      chatId,
    });
    try {
      await Message.create(messageForDB);
    } catch (error) {
      console.log(error);
    }
  });

  socket.on(START_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);
    socket.to(membersSockets).emit(START_TYPING, { chatId });
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);
    socket.to(membersSockets).emit(STOP_TYPING, { chatId });
  });

  socket.on(CHAT_JOINED, ({ userId, members }) => {
    onlineUsers.add(userId.toString());
    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on(CHAT_LEAVED, ({ userId, members }) => {
    onlineUsers.delete(userId.toString());
    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on("disconnect", () => {
    console.log(user.name, "disconnected");
    userSocketIDs.delete(user._id.toString());
    onlineUsers.delete(user._id.toString());
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
  });
});

app.use(errorMiddleware);

server.listen(PORT, () => {
  console.log(`server is listening on port ${PORT}`);
});

export default app;
export { userSocketIDs };
