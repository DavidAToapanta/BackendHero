import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Injectable()
export class ProductoService {
    constructor(private prisma: PrismaService){}

    create(dto: CreateProductoDto){
        return this.prisma.producto.create({ data: dto});
    }

    async findAll(page = 1, limit = 10, search?: string){
        const take = Math.max(1, Math.min(limit, 50));
        const currentPage = Math.max(1, page);
        const skip = (currentPage - 1) * take;

        const where: any = search
            ? {
                nombre: {
                    contains: search,
                    mode: 'insensitive',
                },
            }
            : undefined;

        const [totalItems, productos] = await Promise.all([
            this.prisma.producto.count({ where }),
            this.prisma.producto.findMany({
                where,
                skip,
                take,
                orderBy: { nombre: 'asc' },
            }),
        ]);

        return {
            data: productos,
            meta: {
                totalItems,
                itemCount: productos.length,
                perPage: take,
                totalPages: Math.ceil(totalItems / take),
                currentPage,
            },
        };
    }

    async findOne(id: number){
        const producto = await this.prisma.producto.findUnique({ where: { id}})
        if(!producto) throw new NotFoundException('Producto no encontrado');
        return producto;
    }

    async update(id: number, dto: UpdateProductoDto){
        await this.findOne(id);
        return this.prisma.producto.update({ where: { id}, data: dto});
    }

    async remove(id: number){
        await this.findOne(id);
        return this.prisma.producto.delete({ where: { id}})
    }
}
