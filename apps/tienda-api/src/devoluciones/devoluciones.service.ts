import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { UpdateDevolucionDto } from './dto/update-devolucion.dto';

@Injectable()
export class DevolucionesService {
  create(createDevolucionDto: CreateDevolucionDto): never {
    void createDevolucionDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateDevolucionDto: UpdateDevolucionDto): never {
    void id;
    void updateDevolucionDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
