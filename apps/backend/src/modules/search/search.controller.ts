import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchService, SearchOptions } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /api/search?q=текст&workspaceId=uuid&types=entity,comment&limit=50&offset=0
   *
   * Глобальный поиск по заявкам, комментариям и истории
   */
  @Get()
  async search(
    @Query('q') query: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('types') types?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const options: SearchOptions = {
      workspaceId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      types: types
        ? (types.split(',') as ('entity' | 'comment' | 'audit')[])
        : ['entity', 'comment'],
    };

    return this.searchService.search(query, options);
  }

  /**
   * GET /api/search/entities?q=текст&workspaceId=uuid&limit=50
   *
   * Поиск только по заявкам
   */
  @Get('entities')
  async searchEntities(
    @Query('q') query: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.searchEntities(
      query,
      workspaceId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * GET /api/search/comments?q=текст&workspaceId=uuid&limit=50
   *
   * Поиск только по комментариям
   */
  @Get('comments')
  async searchComments(
    @Query('q') query: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.searchComments(
      query,
      workspaceId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
