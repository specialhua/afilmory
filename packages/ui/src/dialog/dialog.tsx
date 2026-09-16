import { clsxm } from '@afilmory/utils'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsxm('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clsxm('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)

const DialogTitle = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Title> | null>
}) => (
  <DialogPrimitive.Title
    ref={ref}
    className={clsxm('text-lg font-semibold leading-none tracking-tight text-white', className)}
    {...props}
  />
)

const DialogDescription = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Description> | null>
}) => <DialogPrimitive.Description ref={ref} className={clsxm('text-sm text-white/70', className)} {...props} />

export { DialogDescription, DialogFooter, DialogHeader, DialogTitle }
