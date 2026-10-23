// What a plugin gets for a table file (`atlas.table`, lib/table-load.ts): the rows as the Table pane reads them
// (lib/csv/parse.ts finds the delimiter, the header and the numeric columns by shape).
export interface Table { header: string[]; rows: string[][]; numeric: boolean[]; delimiterName: string }
