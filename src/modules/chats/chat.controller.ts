import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { sendNewMessageEmail } from "../../services/email.service";




/**
 * PATCH /api/chats/:channelId/read
 * Mark all messages in a channel as read
 */
export async function markChannelAsRead(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: { select: { linkedUserId: true } },
      },
    });

    if (!channel) {
      return fail(res, "Chat channel not found", 404);
    }

    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) {
      return fail(res, "Access denied to this chat", 403);
    }

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

    return success(res, { message: "Messages marked as read" });
  } catch (err: any) {
    console.error("markChannelAsRead error:", err);
    return fail(res, "Failed to mark messages as read", 500);
  }
}


/**
 * GET /api/chats/available-contacts
 * Get list of users/clients the authenticated user can chat with
 */
export async function getAvailableContacts(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role === "SUPER_ADMIN") {
      // Admin can chat with ALL clients
      const clients = await prisma.client.findMany({
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          logoUrl: true,
          linkedUserId: true,
        },
        orderBy: { companyName: "asc" },
      });

      // Get user details for each client
      const contactsWithUsers = await Promise.all(
        clients.map(async (client) => {
          let user = null;
          // FIXED: Check if linkedUserId exists before querying
          if (client.linkedUserId) {
            user = await prisma.user.findUnique({
              where: { id: client.linkedUserId },
              select: {
                id: true,
                name: true,
                email: true,
              },
            });
          }

          return {
            ...client,
            linkedUser: user,
          };
        })
      );

      return success(res, { contacts: contactsWithUsers });

    } else if (req.user.role === "WORKER") {
      // Worker sees clients from their assigned contracts
      const contracts = await prisma.contract.findMany({
        where: {
          // If this line is red, you MUST run 'npx prisma generate'
          tasks: {
            some: {
              assignedToId: req.user.id,
            },
          },
        },
        select: {
          client: {
            select: {
              id: true,
              companyName: true,
              contactPerson: true,
              logoUrl: true,
              linkedUserId: true,
            },
          },
        },
      });

      // Remove duplicates
      const uniqueClients = contracts
        .map((c) => c.client)
        .filter((client, index, self) => 
          index === self.findIndex((c) => c.id === client.id)
        );

      // Get user details for each client
      const contactsWithUsers = await Promise.all(
        uniqueClients.map(async (client) => {
          let user = null;
          // FIXED: Check if linkedUserId exists before querying
          if (client.linkedUserId) {
            user = await prisma.user.findUnique({
              where: { id: client.linkedUserId },
              select: {
                id: true,
                name: true,
                email: true,
              },
            });
          }

          return {
            ...client,
            linkedUser: user,
          };
        })
      );

      return success(res, { contacts: contactsWithUsers });

    } else {
      // Clients see their assigned worker
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
        include: {
          contracts: {
            include: {
              tasks: {
                where: {
                  assignedToId: { not: null },
                },
                include: {
                  assignedTo: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!client) {
        return success(res, { contacts: [] });
      }

      // Get unique workers from assigned tasks
      const workers: any[] = [];
      const workerIds = new Set<string>();

      client.contracts.forEach((contract) => {
        contract.tasks.forEach((task) => {
          if (task.assignedTo && !workerIds.has(task.assignedTo.id)) {
            workerIds.add(task.assignedTo.id);
            workers.push({
              id: task.assignedTo.id,
              name: task.assignedTo.name,
              email: task.assignedTo.email,
              type: "worker",
            });
          }
        });
      });

      return success(res, { contacts: workers });
    }
  } catch (err: any) {
    console.error("getAvailableContacts error:", err);
    return fail(res, "Failed to get available contacts", 500);
  }
}

/**
 * POST /api/chats/start
 * Start a chat with a contact
 */
export async function startChat(req: AuthedRequest, res: Response) {
  try {
    const { contactId, message } = req.body;

    if (!req.user) return fail(res, "Unauthorized", 401);
    if (!contactId) return fail(res, "Contact ID is required", 400);

    let clientId: string;
    let workerId: string | null = null;

    if (req.user.role === "SUPER_ADMIN" || req.user.role === "WORKER") {
      clientId = contactId;
      workerId = req.user.role === "WORKER" ? req.user.id : null;
    } else {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });
      if (!client) return fail(res, "Client profile not found", 404);
      clientId = client.id;
      workerId = contactId;
    }

    let channel = await prisma.chatChannel.findFirst({
      where: { clientId, workerId: workerId || null },
      include: {
        client: { select: { id: true, companyName: true, logoUrl: true } },
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    if (!channel) {
      channel = await prisma.chatChannel.create({
        data: { clientId, workerId },
        include: {
          client: { select: { id: true, companyName: true, logoUrl: true } },
          worker: { select: { id: true, name: true, email: true } },
        },
      });
    }

    if (message && message.trim()) {
      await prisma.message.create({
        data: {
          channelId: channel.id,
          senderId: req.user.id,
          content: message.trim(),
        },
      });
      await prisma.chatChannel.update({
        where: { id: channel.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return success(res, { channel });
  } catch (err: any) {
    console.error("startChat error:", err);
    return fail(res, "Failed to start chat", 500);
  }
}

/**
 * GET /api/chats
 * Get all chat channels
 */
export async function getUserChats(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    let channels;

    // Common include object for all queries
    const commonInclude = {
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
        orderBy: { createdAt: "desc" as const },
        take: 1,
        include: {
          sender: { select: { id: true, name: true } },
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
    };

    if (req.user.role === "SUPER_ADMIN") {
      channels = await prisma.chatChannel.findMany({
        include: commonInclude,
        orderBy: { lastMessageAt: "desc" },
      });
    } else if (req.user.role === "WORKER") {
      channels = await prisma.chatChannel.findMany({
        where: { workerId: req.user.id },
        include: commonInclude,
        orderBy: { lastMessageAt: "desc" },
      });
    } else {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });
      if (!client) return success(res, { channels: [] });

      channels = await prisma.chatChannel.findMany({
        where: { clientId: client.id },
        include: commonInclude,
        orderBy: { lastMessageAt: "desc" },
      });
    }

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
 */
export async function getChannelMessages(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;
    if (!req.user) return fail(res, "Unauthorized", 401);

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: { select: { linkedUserId: true } },
      },
    });

    if (!channel) return fail(res, "Chat channel not found", 404);

    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) return fail(res, "Access denied", 403);

    const messages = await prisma.message.findMany({
      where: { channelId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Mark as read
    await prisma.message.updateMany({
      where: {
        channelId,
        senderId: { not: req.user.id },
        read: false,
      },
      data: { read: true, readAt: new Date() },
    });

    return success(res, { messages });
  } catch (err: any) {
    console.error("getChannelMessages error:", err);
    return fail(res, "Failed to retrieve messages", 500);
  }
}

/**
 * POST /api/chats/:channelId/messages
 */
export async function sendMessage(req: AuthedRequest, res: Response) {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!req.user) return fail(res, "Unauthorized", 401);
    if (!content || content.trim().length === 0) return fail(res, "Message required", 400);

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: {
          select: {
            id: true,
            linkedUserId: true,
            linkedUser: { select: { email: true, name: true } },
          },
        },
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    if (!channel) return fail(res, "Chat channel not found", 404);

    const hasAccess =
      req.user.role === "SUPER_ADMIN" ||
      channel.workerId === req.user.id ||
      channel.client.linkedUserId === req.user.id;

    if (!hasAccess) return fail(res, "Access denied", 403);

    const message = await prisma.message.create({
      data: {
        channelId,
        senderId: req.user.id,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });

    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { lastMessageAt: new Date() },
    });

    // Determine recipient for notifications
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
        console.error("Email notification failed:", emailError);
      }
    }

    if (recipientId) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          type: "NEW_MESSAGE",
          title: "New Message",
          body: `${req.user.name}: ${content.substring(0, 30)}...`,
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
 */
export async function createOrGetChannel(req: AuthedRequest, res: Response) {
  try {
    const { clientId, workerId } = req.body;
    if (!req.user) return fail(res, "Unauthorized", 401);
    
    // Only admins/workers can manually create
    if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "WORKER") {
      return fail(res, "Permission denied", 403);
    }

    if (!clientId) return fail(res, "Client ID required", 400);

    const existing = await prisma.chatChannel.findFirst({
      where: { clientId, workerId: workerId || null },
      include: {
        client: { select: { id: true, companyName: true, logoUrl: true } },
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    if (existing) return success(res, { channel: existing, created: false });

    const channel = await prisma.chatChannel.create({
      data: { clientId, workerId: workerId || null },
      include: {
        client: { select: { id: true, companyName: true, logoUrl: true } },
        worker: { select: { id: true, name: true, email: true } },
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
 */
export async function getUnreadCount(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    let channelIds: string[] = [];

    if (req.user.role === "SUPER_ADMIN") {
      const channels = await prisma.chatChannel.findMany({ select: { id: true } });
      channelIds = channels.map((c) => c.id);
    } else if (req.user.role === "WORKER") {
      const channels = await prisma.chatChannel.findMany({
        where: { workerId: req.user.id },
        select: { id: true },
      });
      channelIds = channels.map((c) => c.id);
    } else {
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
