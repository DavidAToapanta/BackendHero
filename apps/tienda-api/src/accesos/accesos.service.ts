import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateAccesoDto } from './dto/create-acceso.dto';
import { UpdateAccesoDto } from './dto/update-acceso.dto';

@Injectable()
export class AccesosService {
  create(createAccesoDto: CreateAccesoDto): never {
    void createAccesoDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateAccesoDto: UpdateAccesoDto): never {
    void id;
    void updateAccesoDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
