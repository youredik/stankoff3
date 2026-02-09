import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { IsOptional, IsString, IsNumberString, IsIn } from 'class-validator';
import { UserTasksService, TaskFilter, PaginationParams } from './user-tasks.service';
import { UserTaskStatus } from '../entities/user-task.entity';

class TaskFilterDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  processInstanceId?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  perPage?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'priority', 'dueDate'])
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: string;
}

class CompleteTaskDto {
  formData: Record<string, any>;
}

class DelegateTaskDto {
  toUserId: string;
}

class BatchClaimDto {
  taskIds: string[];
}

class BatchDelegateDto {
  taskIds: string[];
  targetUserId: string;
}

class AddCommentDto {
  content: string;
}

@Controller('bpmn/tasks')
export class UserTasksController {
  constructor(private readonly tasksService: UserTasksService) {}

  /**
   * Get user's task inbox
   * GET /api/bpmn/tasks/inbox?workspaceId=xxx&includeCompleted=false&page=1&perPage=20&sortBy=priority&sortOrder=DESC
   */
  @Get('inbox')
  async getInbox(
    @Request() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('includeCompleted') includeCompleted?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const userId = req.user.id;
    const pagination: PaginationParams = {
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
      sortBy: sortBy as PaginationParams['sortBy'],
      sortOrder: sortOrder as PaginationParams['sortOrder'],
    };
    return this.tasksService.getInbox(
      userId,
      workspaceId,
      includeCompleted === 'true',
      pagination,
    );
  }

  /**
   * Search/filter tasks
   * GET /api/bpmn/tasks?workspaceId=xxx&status=created&page=1&perPage=20&sortBy=createdAt&sortOrder=DESC
   */
  @Get()
  async findTasks(@Query() query: TaskFilterDto) {
    const filter: TaskFilter = {
      workspaceId: query.workspaceId,
      processInstanceId: query.processInstanceId,
      entityId: query.entityId,
      assigneeId: query.assigneeId,
    };

    if (query.status) {
      // Support comma-separated statuses
      const statuses = query.status.split(',') as UserTaskStatus[];
      filter.status = statuses.length === 1 ? statuses[0] : statuses;
    }

    const pagination: PaginationParams = {
      page: query.page ? parseInt(query.page, 10) : undefined,
      perPage: query.perPage ? parseInt(query.perPage, 10) : undefined,
      sortBy: query.sortBy as PaginationParams['sortBy'],
      sortOrder: query.sortOrder as PaginationParams['sortOrder'],
    };

    return this.tasksService.findTasks(filter, pagination);
  }

  /**
   * Get task statistics for workspace
   * GET /api/bpmn/tasks/statistics?workspaceId=xxx
   */
  @Get('statistics')
  async getStatistics(@Query('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.tasksService.getTaskStatistics(workspaceId);
  }

  /**
   * Batch claim tasks
   * POST /api/bpmn/tasks/batch/claim
   */
  @Post('batch/claim')
  async batchClaim(@Body() dto: BatchClaimDto, @Request() req: any) {
    return this.tasksService.batchClaim(dto.taskIds, req.user.id);
  }

  /**
   * Batch delegate tasks
   * POST /api/bpmn/tasks/batch/delegate
   */
  @Post('batch/delegate')
  async batchDelegate(@Body() dto: BatchDelegateDto, @Request() req: any) {
    return this.tasksService.batchDelegate(
      dto.taskIds,
      req.user.id,
      dto.targetUserId,
    );
  }

  /**
   * Get single task with form definition
   * GET /api/bpmn/tasks/:id
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(id);
  }

  /**
   * Get task comments
   * GET /api/bpmn/tasks/:id/comments
   */
  @Get(':id/comments')
  async getComments(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.getComments(id);
  }

  /**
   * Claim a task
   * POST /api/bpmn/tasks/:id/claim
   */
  @Post(':id/claim')
  async claim(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.tasksService.claim(id, req.user.id);
  }

  /**
   * Unclaim a task
   * POST /api/bpmn/tasks/:id/unclaim
   */
  @Post(':id/unclaim')
  async unclaim(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.tasksService.unclaim(id, req.user.id);
  }

  /**
   * Complete a task with form data
   * POST /api/bpmn/tasks/:id/complete
   */
  @Post(':id/complete')
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
    @Request() req: any,
  ) {
    return this.tasksService.complete(id, req.user.id, dto.formData || {});
  }

  /**
   * Delegate a task to another user
   * POST /api/bpmn/tasks/:id/delegate
   */
  @Post(':id/delegate')
  async delegate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DelegateTaskDto,
    @Request() req: any,
  ) {
    return this.tasksService.delegate(id, req.user.id, dto.toUserId);
  }

  /**
   * Add a comment to a task
   * POST /api/bpmn/tasks/:id/comments
   */
  @Post(':id/comments')
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCommentDto,
    @Request() req: any,
  ) {
    return this.tasksService.addComment(id, req.user.id, dto.content);
  }
}
