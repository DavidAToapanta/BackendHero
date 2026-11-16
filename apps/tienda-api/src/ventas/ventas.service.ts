import { Injectable, NotImplementedException } from '@nestjs/common';
import { UpdateVentaDto } from './dto/update-venta.dto';

@Injectable()
export class VentasService {
  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateVentaDto: UpdateVentaDto): never {
    void id;
    void updateVentaDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
