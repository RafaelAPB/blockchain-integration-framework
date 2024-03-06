export class Utils {
  static bufArray2HexStr(array: Uint8Array): string {
    return Buffer.from(array).toString("hex");
  }

  static writeKeyToFile(fileName: string, key: string): void {
    const fs = require("fs");

    fs.writeFile(fileName, key, function (err: boolean) {
      if (err) {
        return console.error(err);
      }
      console.log("File created!");
    });
  }

  static readKeyFromFile(fileName: string): string {
    const fs = require("fs");
    const data = fs.readFileSync(fileName, "utf8");
    return data;
  }
}
