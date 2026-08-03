import prisma from '../config/database';
import { encrypt } from '../utils/crypto';

export class RegistryService {
  /**
   * Register or update a Docker registry credential.
   * Encrypts the password/token at rest using AES-256-GCM.
   */
  async saveRegistry(name: string, url: string, username: string, passwordSecret: string) {
    const encryptedPassword = encrypt(passwordSecret);
    
    // Normalize URL (e.g. trim trailing slash and convert to lowercase)
    const normalizedUrl = url.trim().replace(/\/$/, '').toLowerCase();

    return prisma.registry.upsert({
      where: { url: normalizedUrl },
      update: {
        name,
        username,
        password: encryptedPassword,
      },
      create: {
        name,
        url: normalizedUrl,
        username,
        password: encryptedPassword,
      },
    });
  }

  /**
   * Returns list of registries.
   * EXCLUDES the encrypted password field for security.
   */
  async listRegistries() {
    return prisma.registry.findMany({
      select: {
        id: true,
        name: true,
        url: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Delete registry credential by ID
   */
  async deleteRegistry(id: string) {
    return prisma.registry.delete({
      where: { id },
    });
  }
}
export default RegistryService;
