import { JwtService } from '@nestjs/jwt';
import { OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { NotificationsService } from './notifications.service';

type TenantAwareSocket = Socket & {
  data: {
    tenantId?: number;
  };
};

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: ['http://localhost:4200'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer() server: Namespace;
  private readonly lastSnapshots = new Map<number, string>();
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly jwtService: JwtService,
  ) {}

  async afterInit() {
    if (this.intervalRef) {
      return;
    }

    this.intervalRef = setInterval(() => {
      void this.emitNotificationsCycle();
    }, 10000);
  }

  onModuleDestroy() {
    if (!this.intervalRef) {
      return;
    }

    clearInterval(this.intervalRef);
    this.intervalRef = null;
  }

  async handleConnection(client: TenantAwareSocket) {
    const tenantId = this.resolveTenantId(client);
    if (!tenantId) {
      client.disconnect(true);
      return;
    }

    client.data.tenantId = tenantId;
    await client.join(this.getTenantRoom(tenantId));

    const notifications =
      await this.notificationsService.getCurrentNotifications(tenantId);
    client.emit('notificationsUpdate', notifications);
  }

  handleDisconnect(client: TenantAwareSocket) {
    const tenantId = client.data?.tenantId;
    if (!tenantId) {
      return;
    }

    const rooms = this.getRooms();
    if (!rooms?.has(this.getTenantRoom(tenantId))) {
      this.lastSnapshots.delete(tenantId);
    }
  }

  private async emitNotificationsCycle() {
    const tenantIds = this.getActiveTenantIds();
    if (!tenantIds.length) {
      return;
    }

    for (const tenantId of tenantIds) {
      try {
        const notifications =
          await this.notificationsService.getCurrentNotifications(tenantId);
        const snapshot = JSON.stringify(notifications);

        if (this.lastSnapshots.get(tenantId) === snapshot) {
          continue;
        }

        this.lastSnapshots.set(tenantId, snapshot);
        this.server
          .to(this.getTenantRoom(tenantId))
          .emit('notificationsUpdate', notifications);
      } catch {
        continue;
      }
    }
  }

  private getActiveTenantIds() {
    const rooms = this.getRooms();
    if (!rooms) {
      return [];
    }

    const tenantIds = new Set<number>();

    for (const roomName of rooms.keys()) {
      const tenantId = this.getTenantIdFromRoom(roomName);
      if (tenantId) {
        tenantIds.add(tenantId);
      }
    }

    return [...tenantIds];
  }

  private getRooms() {
    return this.server?.adapter?.rooms;
  }

  private getTenantIdFromRoom(roomName: string) {
    if (!roomName.startsWith('tenant:')) {
      return null;
    }

    const tenantId = Number(roomName.slice('tenant:'.length));
    return tenantId && !Number.isNaN(tenantId) ? tenantId : null;
  }

  private getTenantRoom(tenantId: number) {
    return `tenant:${tenantId}`;
  }

  private resolveTenantId(client: TenantAwareSocket) {
    const token = this.extractToken(client);
    if (token) {
      try {
        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'supersecret',
        });
        const verifiedTenantId = Number(payload?.tenantId);
        if (verifiedTenantId && !Number.isNaN(verifiedTenantId)) {
          return verifiedTenantId;
        }
      } catch {
        // Fallback below for local/dev clients still sending tenantId directly.
      }
    }

    const tenantId = Number(
      client.handshake.auth?.tenantId ?? client.handshake.query?.tenantId,
    );
    return tenantId && !Number.isNaN(tenantId) ? tenantId : null;
  }

  private extractToken(client: TenantAwareSocket) {
    const authToken =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : null;

    if (authToken?.startsWith('Bearer ')) {
      return authToken.slice(7);
    }

    if (authToken) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    return null;
  }
}
