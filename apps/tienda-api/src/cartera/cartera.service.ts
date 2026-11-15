import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateCarteraDto } from './dto/create-cartera.dto';
import { UpdateCarteraDto } from './dto/update-cartera.dto';

@Injectable()
export class CarteraService {
  create(createCarteraDto: CreateCarteraDto): never {
    void createCarteraDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateCarteraDto: UpdateCarteraDto): never {
    void id;
    void updateCarteraDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
