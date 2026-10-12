import * as Dialog from "@radix-ui/react-dialog";
import { VeilApp, type ScrollProps, type SheetProps } from "./veil/VeilApp";

function NativeScroll({ className, children }: ScrollProps) {
  return <div className={`native-scroll ${className || ""}`}>{children}</div>;
}

function NativeSheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="native-sheet-overlay" />
    <Dialog.Content className="native-sheet">
      <div className="native-sheet-grip" aria-hidden="true" />
      <header className="native-sheet-header"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></header>
      <div className="native-sheet-content">{children}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export function NativeApp() { return <VeilApp Scroll={NativeScroll} Sheet={NativeSheet} />; }
