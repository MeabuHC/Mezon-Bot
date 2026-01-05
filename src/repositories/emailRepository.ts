import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UserEmailData {
    mezonUserId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiry?: Date;
}

export class EmailRepository {
    /**
     * Save or update user email credentials
     */
    async saveUserEmail(data: UserEmailData) {
        return await prisma.userEmail.upsert({
            where: { mezonUserId: data.mezonUserId },
            update: {
                email: data.email,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                tokenExpiry: data.tokenExpiry,
                updatedAt: new Date()
            },
            create: {
                mezonUserId: data.mezonUserId,
                email: data.email,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                tokenExpiry: data.tokenExpiry
            }
        });
    }

    /**
     * Get user email credentials by Mezon user ID
     */
    async getUserEmail(mezonUserId: string) {
        return await prisma.userEmail.findUnique({
            where: { mezonUserId }
        });
    }

    /**
     * Delete user email credentials
     */
    async deleteUserEmail(mezonUserId: string) {
        return await prisma.userEmail.delete({
            where: { mezonUserId }
        });
    }

    /**
     * Check if user has connected email
     */
    async hasConnectedEmail(mezonUserId: string): Promise<boolean> {
        const count = await prisma.userEmail.count({
            where: { mezonUserId }
        });
        return count > 0;
    }
}

export const emailRepository = new EmailRepository();
