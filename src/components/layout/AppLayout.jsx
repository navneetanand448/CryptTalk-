import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Header from "./Header";
import Title from "../shared/Title";
import { Grid2, Box, Divider, Skeleton, Drawer } from "@mui/material";
import ChatList from "../specific/ChatList";
import { useNavigate, useParams } from "react-router-dom";
import { useMyChatsQuery } from "../../redux/api/api";
import { useDispatch, useSelector } from "react-redux";
import {
  setIsDeleteMenu,
  setIsMobile,
  setSelectedDeleteChat,
} from "../../redux/reducers/misc";
import { useErrors, useSocketEvents } from "../../hooks/hooks";
import { getSocket } from "../../socket";
import {
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  NEW_REQUEST,
  ONLINE_USERS,
  REFETCH_CHATS,
} from "../constants/events";
import {
  incrementNotificationCount,
  setNewMessagesAlert,
} from "../../redux/reducers/chat";
import { getOrSaveFromStorage } from "../../lib/features";
import { DeleteChatMenu } from "../dailogs/DeleteChatMenu";

const AppLayout = () => (WrappedComponent) => {
  return (props) => {
    const deleteMenuAnchor = useRef(null);
    const params = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const chatId = params.chatId;

    const [onlineUsers, setOlineUsers] = useState([]);

    const { isMobile } = useSelector((state) => state.misc);
    const { user } = useSelector((state) => state.auth);
    const { newMessageAlert } = useSelector((state) => state.chat);
    const { isDeleteMenu } = useSelector((state) => state.misc);
    // console.log("newMessageAlert", newMessageAlert);
    const socket = getSocket();
    console.log(socket.id);
    const { isLoading, data, isError, error, refetch } = useMyChatsQuery("");

    useErrors([{ isError, error }]);

    useEffect(() => {
      getOrSaveFromStorage({ key: NEW_MESSAGE_ALERT, value: newMessageAlert });
    }, [newMessageAlert]);

    const handleDeleteChat = (e, _id, groupChat) => {
      dispatch(setIsDeleteMenu(true));
      dispatch(setSelectedDeleteChat({ chatId, groupChat }));
      deleteMenuAnchor.current = e.currentTarget;
      console.log("delete chat", _id, groupChat);
    };

    const handleMobileClose = () => dispatch(setIsMobile(false));

    const newMessageAlertListner = useCallback(
      (data) => {
        console.log(data);
        console.log(chatId);
        if (data.chatId === chatId) return;
        dispatch(setNewMessagesAlert(data));
      },
      [chatId]
    );

    const newRequestListner = useCallback(() => {
      dispatch(incrementNotificationCount());
    }, [dispatch]);

    const refetchListner = useCallback(() => {
      refetch();
      navigate("/");
    }, [refetch, navigate]);

    const onlineUsersListner = useCallback((data) => {
      //console.log(data)
      setOlineUsers(data);
      
    }, []);
    //console.log(onlineUsers);

    const eventsHandlers = {
      [NEW_MESSAGE_ALERT]: newMessageAlertListner,
      [NEW_REQUEST]: newRequestListner,
      [REFETCH_CHATS]: refetchListner,
      [ONLINE_USERS]: onlineUsersListner,
    };
    useSocketEvents(socket, eventsHandlers);

    return (
      <>
        <Title />
        <Header />
        <DeleteChatMenu
          open={isDeleteMenu}
          dispatch={dispatch}
          deleteOptionAnchor={deleteMenuAnchor.current}
        />
        {isLoading ? (
          <Skeleton>Loading...</Skeleton>
        ) : (
          <Drawer open={isMobile} onClose={handleMobileClose}>
            <ChatList
              w="70vw"
              chats={data?.chats}
              chatId={chatId}
              handleDeleteChat={handleDeleteChat}
              newMessagesAlert={newMessageAlert}
              onlineUsers={onlineUsers}
            />
          </Drawer>
        )}
        <Box>
          <Grid2
            container
            sx={{
              height: "calc(100vh - 65px)",
              flexgrow: 1,
              display: "flex",
            }}
          >
            <Grid2
              size={3}
              height={"100%"}
              sx={{
                display: { xs: "none", sm: "block" },
                bgcolor: "#FFFFFF",
              }}
            >
              {isLoading ? (
                <div>Loading...</div>
              ) : (
                <ChatList
                  chats={data?.chats}
                  chatId={chatId}
                  handleDeleteChat={handleDeleteChat}
                  newMessagesAlert={newMessageAlert}
                  onlineUsers={onlineUsers}
                />
              )}
            </Grid2>
            <Divider orientation="vertical" variant="middle" flexItem></Divider>
            <Grid2 sx={{ flexGrow: 1 }} height={"100%"} bgcolor="#f3f4f6">
              <WrappedComponent {...props} chatId={chatId} user={user} />
            </Grid2>
          </Grid2>
        </Box>
      </>
    );
  };
};

export default AppLayout;
