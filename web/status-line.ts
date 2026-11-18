export interface StatusLine {
  message: string;
  isError: boolean;
}

export const NO_STATUS: StatusLine = { message: '', isError: false };
