import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductoService } from './producto.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Controller('producto')
export class ProductoController {
    constructor(private readonly productoService: ProductoService) {}

    @Post()
    create(@Body() dto: CreateProductoDto){
        return this.productoService.create(dto);
    }

    @Get()
    findAll(@Query('page') page = '1', @Query('limit') limit = '10', @Query('search') search = ''){
        return this.productoService.findAll(+page, +limit, search);
    }

    @Get(':id')
    findOne(@Param('id') id: string){
        return this.productoService.findOne(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateProductoDto){
        return this.productoService.update(+id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string){
        return this.productoService.remove(+id);
    }
}
