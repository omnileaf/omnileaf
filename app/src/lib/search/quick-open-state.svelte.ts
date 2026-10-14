/** Whether quick open is showing, shared by whatever opens it and the dialog itself. */
export class QuickOpenState {
  isOpen = $state(false);

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }
}
