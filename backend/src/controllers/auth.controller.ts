import { Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

export class AuthController {
  private authService = new AuthService();

  register = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, role } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Allow ADMIN or DEVELOPER roles
      let parsedRole: Role = Role.DEVELOPER;
      if (role && Object.values(Role).includes(role as Role)) {
        parsedRole = role as Role;
      }

      const result = await this.authService.register(
        email,
        password,
        firstName,
        lastName,
        parsedRole
      );

      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Registration failed' });
    }
  };

  login = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const result = await this.authService.login(email, password);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Login failed' });
    }
  };

  refresh = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      const result = await this.authService.refresh(refreshToken);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Token refresh failed' });
    }
  };

  logout = async (req: AuthenticatedRequest, res: Response) => {
    // In stateless JWT, client deletes the token.
    // We simply return a success response.
    res.status(200).json({ message: 'Logout successful' });
  };

  getProfile = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.status(200).json({ user: req.user });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve profile' });
    }
  };
}
