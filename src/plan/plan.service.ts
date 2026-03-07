import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlanService {
    constructor(private prisma: PrismaService){}

    create(dto: CreatePlanDto){
        return this.prisma.plan.create({ data: dto});
    }

    async findAll(page: number = 1, limit: number = 10){
        const skip = (page - 1) * limit;
        
        const [data, total] = await Promise.all([
            this.prisma.plan.findMany({
                take: limit,
                where: { activo: true },
                orderBy: { id: 'desc' }
            }),
            this.prisma.plan.count()
        ]);

        return {
            data,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }

    async findOne(id: number){
        const plan = await this.prisma.plan.findUnique({ where: { id }});
        if(!plan) throw new NotFoundException('Plan no encontrado')
            return plan;
    }

    async update(id: number, dto: UpdatePlanDto ){
        await this.findOne(id);
        return this.prisma.plan.update({ where: {id}, data: dto})
    }

    async delete(id: number){
        await this.findOne(id);
        
        // Soft delete: cambiar estado a inactivo
        return this.prisma.plan.update({
            where: { id },
            data: { activo: false }
        });
    }

    async deleteWithCascade(id: number){
        await this.findOne(id);
        // Intentar eliminar físicamente el plan
        try {
            return await this.prisma.plan.delete({
                where: { id }
            });
        } catch (error) {
            // Si falla por foreign key (ej: tiene ClientePlan asociados), 
            // aquí deberíamos implementar la lógica de borrado en cascada real
            // Por ahora, lanzamos el error o lo notificamos
            throw new BadRequestException('No se puede eliminar el plan porque tiene registros asociados. Se requiere limpieza manual o implementación de borrado en profundidad.');
        }
    }
}
