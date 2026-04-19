import { Module } from '@nestjs/common';
import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClienteModule } from './cliente/cliente.module';
import { ProductoModule } from './producto/producto.module';
import { PlanModule } from './plan/plan.module';
import { ClientePlanModule } from './cliente-plan/cliente-plan.module';
import { PagoModule } from './pago/pago.module';
import { DeudaModule } from './deuda/deuda.module';
import { GastoModule } from './gasto/gasto.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EstadisticasModule } from './estadisticas/estadisticas.module';
import { AdministradorModule } from './administrador/administrador.module';
import { EntrenadorModule } from './entrenador/entrenador.module';
import { RecepcionistaModule } from './recepcionista/recepcionista.module';
import { RutinaModule } from './rutina/rutina.module';
import { CompraModule } from './compra/compra.module';
import { AsistenciaModule } from './asistencia/asistencia.module';
import { FacturaModule } from './factura/factura.module';
import { EntrenamientoModule } from './entrenamiento/entrenamiento.module';
import { TenantModule } from './tenant/tenant.module';
import { StaffModule } from './staff/staff.module';
import { IngresoRapidoModule } from './ingreso-rapido/ingreso-rapido.module';
import { ZkbioModule } from './integrations/zkbio/zkbio.module';

@Module({
  imports: [
    UsuariosModule,
    PrismaModule,
    AuthModule,
    TenantModule,
    StaffModule,
    IngresoRapidoModule,
    ZkbioModule,
    ClienteModule,
    ProductoModule,
    PlanModule,
    ClientePlanModule,
    PagoModule,
    DeudaModule,
    GastoModule,
    NotificationsModule,
    EstadisticasModule,
    AdministradorModule,
    EntrenadorModule,
    RecepcionistaModule,
    RutinaModule,
    CompraModule,
    AsistenciaModule,
    FacturaModule,
    EntrenamientoModule,
  ],
})
export class AppModule {}
