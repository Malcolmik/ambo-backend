import { Router } from "express";
import {
  getUserChats,
  getChannelMessages,
  sendMessage,
  createOrGetChannel,
  getUnreadCount,
  markChannelAsRead,
  getAvailableContacts,
  startChat,
} from "../modules/chats/chat.controller";
import { debugWorkerAssignments } from "../modules/chats/chat-debug.controller";
import { authRequired } from "../middleware/auth";

const router = Router();

// All routes require authentication
router.use(authRequired);

// ============================================
// DEBUG ENDPOINT - REMOVE AFTER FIXING
// ============================================
router.get("/debug/worker-assignments", debugWorkerAssignments);

// ============================================
// CHAT CHANNEL ROUTES
// ============================================

// Get all user's chat channels
router.get("/", getUserChats);

// Get unread message count (for badge)
router.get("/unread-count", getUnreadCount);

// Get available contacts for starting new chat
router.get("/available-contacts", getAvailableContacts);

// Start a new chat
router.post("/start", startChat);

// Create or get existing channel
router.post("/channel", createOrGetChannel);

// Mark channel messages as read
router.patch("/:channelId/read", markChannelAsRead);

// Get messages for a specific channel
router.get("/:channelId/messages", getChannelMessages);

// Send a message to a channel
router.post("/:channelId/messages", sendMessage);

export default router;