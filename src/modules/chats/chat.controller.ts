import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { sendNewMessageEmail } from "../../services/email.service";

/**
 * GET /api/chats
 * Get all chat channels for the authenticated user
 */
export async function getUserChats(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    let channels;

    if (req.user.role === "SUPER_ADMIN") {
      // Admin sees ALL chats
      channels = await prisma.chatChannel.findMany({
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
              contactPerson: true,
              logoUrl: true,
            },
          },
          worker: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1, // Last message only
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              messages: {
                where: {
                  read: false,
                  senderId: { not: req.user.id },
                },
              },
            },
          },
        },
        orderBy: { lastMessageAt: "desc" },
      });
    } else if (req.user.role === "WORKER") {
      // Worker sees chats with their assigned clients
      channels = await prisma.chatChannel.findMany({
        where: { workerId: req.user.id },
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
              contactPerson: true,
              logoUrl: true,
            },
          },
          worker: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              messages: {
                where: {
                  read: false,
                  senderId: { not: req.user.id },
                },
              },
            },
          },
        },
        orderBy: { lastMessageAt: "desc" },
      });
    } else {
      // Client sees only their chat with assigned worker
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client) {
        return success(res, { channels: [] });
      }

      channels = await prisma.chatChannel.findMany({
        where: { clientId: client.id },
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
              contactPerson: true,
              logoUrl: true,
            },
          },
          worker: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              messages: {
                where: {
                  read: false,
                  senderId: { not: req.user.id },
                },
              },
            },
          },
        },
        orderBy: { lastMessageAt: "desc" },
      });
    }

    // Format response
    const formattedChannels = channels.map((channel) => ({
      id: channel.id,
      client: channel.client,
      worker: channel.worker,
      lastMessage: channel.messages[0] || null,
      unreadCount: channel._count.messages,
      lastMessageAt: channel.lastMessageAt,
      createdAt: channel.createdAt,
    }));

    return success(res, { channels: formattedChannels });
  } catch (err: any) {
    console.error("getUserChats error:", err);
    return fail(res, "Failed to retrieve chats", 500);
  }
}

/**
 * GET /api/chats/:channelId/messages
 * Get all messages in a chat channel
 */
export async function getChannelMessages(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Verify user has access to this channel
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: {
          select: { linkedUserId: true },
        },
      },
    });

    if (!channel) {
      return fail(res, "Chat channel not found", 404);
    }

    // Check permissions
    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) {
      return fail(res, "Access denied to this chat", 403);
    }

    // Get messages
    const messages = await prisma.message.findMany({
      where: { channelId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        channelId,
        senderId: { not: req.user.id },
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return success(res, { messages });
  } catch (err: any) {
    console.error("getChannelMessages error:", err);
    return fail(res, "Failed to retrieve messages", 500);
  }
}

/**
 * POST /api/chats/:channelId/messages
 * Send a message in a chat channel
 */
export async function sendMessage(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!content || content.trim().length === 0) {
      return fail(res, "Message content is required", 400);
    }

    // Verify channel exists and user has access
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            linkedUserId: true,
            linkedUser: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!channel) {
      return fail(res, "Chat channel not found", 404);
    }

    // Check permissions
    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) {
      return fail(res, "Access denied to this chat", 403);
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        channelId,
        senderId: req.user.id,
        content: content.trim(),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Update channel's lastMessageAt
    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { lastMessageAt: new Date() },
    });

    // Determine recipient
    const recipientEmail =
      req.user.id === channel.client.linkedUserId
        ? channel.worker?.email
        : channel.client.linkedUser?.email;

    const recipientName =
      req.user.id === channel.client.linkedUserId
        ? channel.worker?.name
        : channel.client.linkedUser?.name;

    const recipientId =
      req.user.id === channel.client.linkedUserId
        ? channel.workerId
        : channel.client.linkedUserId;

    // Send email notification to the recipient
    if (recipientEmail && recipientName) {
      try {
        const chatUrl = `${process.env.FRONTEND_URL || "https://ambo-dash.lovable.app"}/messages/${channelId}`;
        
        await sendNewMessageEmail(
          recipientEmail,
          recipientName,
          req.user.name,
          content,
          chatUrl
        );
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError);
        // Don't fail the request if email fails
      }
    }

    // Create in-app notification
    if (recipientId) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          type: "NEW_MESSAGE",
          title: "New Message",
          body: `${req.user.name} sent you a message: "${content.substring(0, 50)}${content.length > 50 ? "..." : ""}"`,
          read: false,
        },
      });
    }

    return success(res, { message });
  } catch (err: any) {
    console.error("sendMessage error:", err);
    return fail(res, "Failed to send message", 500);
  }
}

/**
 * POST /api/chats/create
 * Create or get existing chat channel (for admins/workers creating chats)
 */
export async function createOrGetChannel(req: AuthedRequest, res: Response) {
  try {
    const { clientId, workerId } = req.body;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Only admins and workers can create channels manually
    if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "WORKER") {
      return fail(res, "Only admins and workers can create chat channels", 403);
    }

    if (!clientId) {
      return fail(res, "Client ID is required", 400);
    }

    // Check if channel already exists
    const existing = await prisma.chatChannel.findFirst({
      where: {
        clientId,
        workerId: workerId || null,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactPerson: true,
            logoUrl: true,
          },
        },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (existing) {
      return success(res, { channel: existing, created: false });
    }

    // Create new channel
    const channel = await prisma.chatChannel.create({
      data: {
        clientId,
        workerId: workerId || null,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactPerson: true,
            logoUrl: true,
          },
        },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return success(res, { channel, created: true });
  } catch (err: any) {
    console.error("createOrGetChannel error:", err);
    return fail(res, "Failed to create chat channel", 500);
  }
}

/**
 * GET /api/chats/unread-count
 * Get total unread message count for badge display
 */
export async function getUnreadCount(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    let channelIds: string[] = [];

    if (req.user.role === "SUPER_ADMIN") {
      // Admin sees all channels
      const channels = await prisma.chatChannel.findMany({
        select: { id: true },
      });
      channelIds = channels.map((c) => c.id);
    } else if (req.user.role === "WORKER") {
      // Worker's channels
      const channels = await prisma.chatChannel.findMany({
        where: { workerId: req.user.id },
        select: { id: true },
      });
      channelIds = channels.map((c) => c.id);
    } else {
      // Client's channels
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (client) {
        const channels = await prisma.chatChannel.findMany({
          where: { clientId: client.id },
          select: { id: true },
        });
        channelIds = channels.map((c) => c.id);
      }
    }

    // Count unread messages
    const unreadCount = await prisma.message.count({
      where: {
        channelId: { in: channelIds },
        senderId: { not: req.user.id },
        read: false,
      },
    });

    return success(res, { unreadCount });
  } catch (err: any) {
    console.error("getUnreadCount error:", err);
    return fail(res, "Failed to get unread count", 500);
  }
}