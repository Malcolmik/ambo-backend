import { Router } from "express";
import {
  getUserChats,
  getChannelMessages,
  sendMessage,
  createOrGetChannel,
  getUnreadCount,
} from "../modules/chats/chat.controller";
import {
  getAvailableContacts,
  startChat,
} from "../modules/chats/chat.controller";
import { authRequired } from "../middleware/auth";

const router = Router();

// All routes require authentication
router.use(authRequired);

// Get all user's chat channels
router.get("/", getUserChats);

// Get unread message count (for badge)
router.get("/unread-count", getUnreadCount);

// Get available contacts to start chat with
router.get("/available-contacts", getAvailableContacts);

// Start a new chat (creates channel and optionally sends first message)
router.post("/start", startChat);

// Create or get a chat channel (admins/workers only) - DEPRECATED, use /start instead
router.post("/create", createOrGetChannel);

// Get messages in a specific channel
router.get("/:channelId/messages", getChannelMessages);

// Send a message in a channel
router.post("/:channelId/messages", sendMessage);

export default router;