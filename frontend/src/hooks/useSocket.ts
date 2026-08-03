import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

export const useSocket = () => {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    if (!socketRef.current) {
      socketRef.current = io('http://localhost:4000', {
        transports: ['websocket'],
      });
      console.log('[Socket Hook] Socket.IO connection opened');
    }

    return () => {
      // We don't disconnect immediately on unmount because multiple components might be using the socket.
      // But we can let it persist and clean up on logout.
    };
  }, [isAuthenticated]);

  return socketRef.current;
};

export default useSocket;
