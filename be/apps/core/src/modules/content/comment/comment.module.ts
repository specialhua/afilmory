import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { CommentController } from './comment.controller'
import { AllowAllCommentModerationHook, COMMENT_MODERATION_HOOK } from './comment.moderation'
import { CommentService } from './comment.service'

@Module({
  imports: [DatabaseModule],
  controllers: [CommentController],
  providers: [
    CommentService,
    AllowAllCommentModerationHook,
    {
      provide: COMMENT_MODERATION_HOOK,
      useExisting: AllowAllCommentModerationHook,
    },
  ],
})
export class CommentModule {}
