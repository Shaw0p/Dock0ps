import prisma from '../config/database';

/**
 * Logs user and operational activities to the database for auditing and history tracking.
 */
export async function logActivity(
  userId: string | null,
  action: string,
  details: string,
  userEmail: string | null = null
) {
  try {
    await prisma.activity.create({
      data: {
        userId,
        userEmail,
        action,
        details,
      },
    });
  } catch (err: any) {
    console.error('[Activity Utility] Failed to record log entry in DB:', err.message);
  }
}
