import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeArticleService } from './services/knowledge-article.service';
import { CreateFaqDto, UpdateArticleDto, ArticleFilterDto } from './dto/knowledge-base.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly articleService: KnowledgeArticleService) {}

  @Get('articles')
  async getArticles(@Query() filters: ArticleFilterDto, @CurrentUser() user: User) {
    return this.articleService.findAll(filters, user.id, user.role);
  }

  @Get('articles/:id')
  async getArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.articleService.findOne(id, user.id, user.role);
  }

  @Post('articles')
  async createFaq(@Body() dto: CreateFaqDto, @CurrentUser() user: User) {
    return this.articleService.createFaq(dto, user.id);
  }

  @Post('articles/upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('workspaceId') workspaceId: string,
    @Body('category') category: string,
    @Body('tags') tagsJson: string,
    @CurrentUser() user: User,
  ) {
    const tags = tagsJson ? JSON.parse(tagsJson) : [];

    return this.articleService.uploadDocument(
      file,
      { title, workspaceId: workspaceId || undefined, category: category || undefined, tags },
      user.id,
    );
  }

  @Put('articles/:id')
  async updateArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: User,
  ) {
    return this.articleService.update(id, dto, user.id, user.role);
  }

  @Delete('articles/:id')
  async deleteArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.articleService.delete(id, user.id, user.role);
    return { success: true };
  }

  @Get('categories')
  async getCategories(@Query('workspaceId') workspaceId?: string) {
    return this.articleService.getCategories(workspaceId);
  }

  @Get('stats')
  async getStats(@Query('workspaceId') workspaceId?: string) {
    return this.articleService.getStats(workspaceId);
  }
}
