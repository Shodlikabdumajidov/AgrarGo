import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { NewsAiService } from './news-ai.service';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({ imports: [AdminModule], controllers: [NewsController], providers: [NewsService, NewsAiService], exports: [NewsService] })
export class NewsModule {}
