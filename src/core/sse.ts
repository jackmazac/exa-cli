export interface SseFrame {
  id: string;
  event: string;
  data: string;
}

export class SseParser {
  private buffer = "";
  private eventName = "";
  private eventId = "";
  private dataLines: string[] = [];

  push(chunk: string): SseFrame[] {
    const frames: SseFrame[] = [];
    this.buffer += chunk;

    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith("\r")) {
        line = line.slice(0, line.length - 1);
      }
      this.processLine(line, frames);
      newline = this.buffer.indexOf("\n");
    }
    return frames;
  }

  finish(): SseFrame[] {
    const frames: SseFrame[] = [];
    if (this.buffer.length > 0) {
      let line = this.buffer;
      if (line.endsWith("\r")) {
        line = line.slice(0, line.length - 1);
      }
      this.buffer = "";
      this.processLine(line, frames);
    }
    this.dispatch(frames);
    return frames;
  }

  private processLine(line: string, frames: SseFrame[]): void {
    if (line.length === 0) {
      this.dispatch(frames);
      return;
    }
    if (line.startsWith(":")) {
      return;
    }

    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      this.eventName = value;
    } else if (field === "id") {
      this.eventId = value;
    } else if (field === "data") {
      this.dataLines.push(value);
    }
  }

  private dispatch(frames: SseFrame[]): void {
    if (this.dataLines.length > 0) {
      frames.push({
        id: this.eventId,
        event: this.eventName,
        data: this.dataLines.join("\n"),
      });
    }
    this.eventName = "";
    this.eventId = "";
    this.dataLines = [];
  }
}
