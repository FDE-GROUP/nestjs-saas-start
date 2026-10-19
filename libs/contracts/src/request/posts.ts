import { z } from 'zod';
import { reqString } from '../helpers';
import { strictObject } from '../strict';

/** 创建 post 入参（旧 `CreatePostDto`·@Body JSON）。 */
export const createPostSchema = strictObject({
  title: reqString('validate.title.required'),
  content: z.string().optional(),
  published: z.boolean().optional(),
});
export type CreatePost = z.infer<typeof createPostSchema>;
