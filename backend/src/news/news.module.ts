import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { NewsAiService } from './news-ai.service';
import { NewsIngestorService } from './news-ingestor.service';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({ imports: [AdminModule], controllers: [NewsController], providers: [NewsService, NewsAiService, NewsIngestorService], exports: [NewsService] })
export class NewsModule {}
