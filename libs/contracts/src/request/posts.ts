import { z } from 'zod';
import { optStringMax, reqStringMax } from '../helpers';
import { strictObject } from '../strict';

/** 创建 post 入参（旧 `CreatePostDto`·@Body JSON）。 */
export const createPostSchema = strictObject({
  title: reqStringMax('validate.title.required', 200),
  content: optStringMax(20000),
  published: z.boolean().optional(),
});
export type CreatePost = z.infer<typeof createPostSchema>;
