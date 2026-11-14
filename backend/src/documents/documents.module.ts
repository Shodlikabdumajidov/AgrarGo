import { Module } from '@nestjs/common';
import { DocumentsController, OrderDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({ controllers: [DocumentsController, OrderDocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
