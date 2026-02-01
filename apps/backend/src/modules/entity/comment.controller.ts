import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get()
  findByEntity(@Body() body: { entityId: string }) {
    return this.commentService.findByEntity(body.entityId);
  }

  @Get('entity/:entityId')
  findByEntityParam(@Param('entityId') entityId: string) {
    return this.commentService.findByEntity(entityId);
  }

  @Post('entity/:entityId')
  create(
    @Param('entityId') entityId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentService.create(entityId, dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { content: string }) {
    return this.commentService.update(id, body.content);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commentService.remove(id);
  }
}
