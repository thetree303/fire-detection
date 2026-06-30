import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
})
export class Gateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(Gateway.name);

  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}
