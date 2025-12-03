import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * POST /api/reviews
 * Submit a review for a completed contract
 * CLIENT_VIEWER only
 */
export async function submitReview(req: AuthedRequest, res: Response) {
  try {
    const { contractId, rating, feedback } = req.body;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!contractId || !rating) {
      return fail(res, "Contract ID and rating are required", 400);
    }

    if (rating < 1 || rating > 5) {
      return fail(res, "Rating must be between 1 and 5", 400);
    }

    // Find contract and verify ownership
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { client: true },
    });

    if (!contract) {
      return fail(res, "Contract not found", 404);
    }

    // Only client can leave review
    if (req.user.role === "CLIENT_VIEWER") {
      if (contract.client.linkedUserId !== req.user.id) {
        return fail(res, "Forbidden: You can only review your own contracts", 403);
      }
    } else if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only clients can submit reviews", 403);
    }

    // Check if review already exists
    const existing = await prisma.review.findFirst({
      where: { contractId },
    });

    if (existing) {
      // Update existing review
      const updated = await prisma.review.update({
        where: { id: existing.id },
        data: {
          rating,
          feedback,
          updatedAt: new Date(),
        },
      });

      return success(res, {
        message: "Review updated successfully",
        review: updated,
      });
    }

    // Create new review
    const review = await prisma.review.create({
      data: {
        contractId,
        rating,
        feedback,
      },
    });

    // Notify super admins
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", active: true },
      select: { id: true },
    });

    for (const admin of superAdmins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "REVIEW_SUBMITTED",
          title: "New Client Review",
          body: `${contract.client.companyName} submitted a ${rating}-star review`,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "REVIEW_SUBMITTED",
        entityType: "CONTRACT",
        entityId: contractId,
        metaJson: {
          rating,
          reviewId: review.id,
        } as any,
      },
    });

    return success(res, {
      message: "Review submitted successfully",
      review,
    }, 201);
  } catch (err: any) {
    console.error("submitReview error:", err);
    return fail(res, "Failed to submit review", 500);
  }
}

/**
 * GET /api/reviews/my
 * Get reviews for the authenticated user's contracts
 */
export async function getMyReviews(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    let reviews;

    if (req.user.role === "CLIENT_VIEWER") {
      // Get client's reviews
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client) {
        return success(res, { reviews: [], count: 0 });
      }

      reviews = await prisma.review.findMany({
        where: {
          contract: {
            clientId: client.id,
          },
        },
        include: {
          contract: {
            select: {
              packageType: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } else if (req.user.role === "SUPER_ADMIN") {
      // Get all reviews
      reviews = await prisma.review.findMany({
        include: {
          contract: {
            select: {
              packageType: true,
              createdAt: true,
              client: {
                select: {
                  companyName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      return fail(res, "Forbidden", 403);
    }

    return success(res, {
      reviews,
      count: reviews.length,
    });
  } catch (err: any) {
    console.error("getMyReviews error:", err);
    return fail(res, "Failed to retrieve reviews", 500);
  }
}

/**
 * GET /api/reviews/contract/:contractId
 * Get review for a specific contract
 */
export async function getContractReview(req: AuthedRequest, res: Response) {
  try {
    const { contractId } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const review = await prisma.review.findFirst({
      where: { contractId },
      include: {
        contract: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!review) {
      return success(res, { review: null });
    }

    // Check authorization
    if (req.user.role === "CLIENT_VIEWER") {
      if (review.contract.client.linkedUserId !== req.user.id) {
        return fail(res, "Forbidden", 403);
      }
    } else if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    return success(res, { review });
  } catch (err: any) {
    console.error("getContractReview error:", err);
    return fail(res, "Failed to retrieve review", 500);
  }
}

/**
 * GET /api/reviews/stats
 * Get review statistics (SUPER_ADMIN only)
 */
export async function getReviewStats(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can access stats", 403);
    }

    const reviews = await prisma.review.findMany({
      select: {
        rating: true,
        createdAt: true,
      },
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    // Rating distribution
    const ratingDistribution = {
      5: reviews.filter((r) => r.rating === 5).length,
      4: reviews.filter((r) => r.rating === 4).length,
      3: reviews.filter((r) => r.rating === 3).length,
      2: reviews.filter((r) => r.rating === 2).length,
      1: reviews.filter((r) => r.rating === 1).length,
    };

    return success(res, {
      totalReviews,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution,
    });
  } catch (err: any) {
    console.error("getReviewStats error:", err);
    return fail(res, "Failed to get review stats", 500);
  }
}
