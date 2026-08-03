import dotenv from 'dotenv';
dotenv.config();

import { AuthService } from './services/auth.service';
import prisma from './config/database';
import { Role } from '@prisma/client';

async function runTests() {
  console.log('=== Starting Auth & DB Integration Tests ===');

  const authService = new AuthService();
  const testEmail = `testuser-${Date.now()}@dockops.dev`;
  const testPassword = 'SecurePassword123!';

  try {
    // 1. Clean up any existing test user (should be none due to unique timestamp)
    console.log(`[Test] Registering user: ${testEmail}...`);
    
    // 2. Test Registration
    const registerResult = await authService.register(
      testEmail,
      testPassword,
      'Test',
      'User',
      Role.DEVELOPER
    );
    
    if (registerResult.user.email !== testEmail) {
      throw new Error('Registration failed: Email mismatch');
    }
    if (!registerResult.accessToken || !registerResult.refreshToken) {
      throw new Error('Registration failed: Missing JWT tokens');
    }
    console.log('✔ Registration successful. User created and tokens issued.');

    // 3. Test Double Registration (Should Fail)
    console.log('[Test] Verifying registration duplicates check...');
    try {
      await authService.register(testEmail, testPassword);
      throw new Error('Test failed: Allowed registering a duplicate email');
    } catch (err: any) {
      if (err.message.includes('already exists')) {
        console.log('✔ Duplicate email check working.');
      } else {
        throw err;
      }
    }

    // 4. Test Login
    console.log('[Test] Logging in with credentials...');
    const loginResult = await authService.login(testEmail, testPassword);
    if (!loginResult.accessToken) {
      throw new Error('Login failed: Token not returned');
    }
    console.log('✔ Login successful.');

    // 5. Test Password Validation (Should Fail)
    console.log('[Test] Verifying password mismatch handling...');
    try {
      await authService.login(testEmail, 'WrongPassword');
      throw new Error('Test failed: Allowed login with incorrect password');
    } catch (err: any) {
      if (err.message.includes('Invalid email or password')) {
        console.log('✔ Password validation working.');
      } else {
        throw err;
      }
    }

    // 6. Test Token Refresh
    console.log('[Test] Refreshing access token...');
    const refreshResult = await authService.refresh(loginResult.refreshToken);
    if (!refreshResult.accessToken) {
      throw new Error('Token refresh failed: New access token not generated');
    }
    console.log('✔ Token refresh successful.');

    // Cleanup
    console.log('[Test] Cleaning up database records...');
    await prisma.user.delete({
      where: { email: testEmail },
    });
    console.log('✔ Cleanup complete.');

    console.log('=== All Auth & DB Integration Tests Passed Successfully! ===');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Integration Test Failed:', error.message);
    process.exit(1);
  }
}

runTests();
