import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateFinanzaDto } from './dto/create-finanza.dto';
import { UpdateFinanzaDto } from './dto/update-finanza.dto';

@Injectable()
export class FinanzasService {
  create(createFinanzaDto: CreateFinanzaDto): never {
    void createFinanzaDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateFinanzaDto: UpdateFinanzaDto): never {
    void id;
    void updateFinanzaDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
