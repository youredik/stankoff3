import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ProductCategoryService, CategoryTreeNode } from './product-category.service';
import { ProductCategory } from './product-category.entity';

@Controller('product-categories')
export class ProductCategoryController {
  constructor(private readonly service: ProductCategoryService) {}

  @Get()
  async findAll(@Query('workspaceId') workspaceId: string): Promise<ProductCategory[]> {
    return this.service.findAll(workspaceId);
  }

  @Get('tree')
  async findTree(@Query('workspaceId') workspaceId: string): Promise<CategoryTreeNode[]> {
    return this.service.findTree(workspaceId);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ProductCategory> {
    return this.service.findById(id);
  }

  @Post()
  async create(@Body() data: Partial<ProductCategory>): Promise<ProductCategory> {
    return this.service.create(data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Partial<ProductCategory>,
  ): Promise<ProductCategory> {
    return this.service.update(id, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
