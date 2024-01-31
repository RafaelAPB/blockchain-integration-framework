import { IOdapLocalLog } from "../plugin-odap-gateway";
import { ILocalLogRepository } from "./interfaces/repository"
import knex, { Knex } from "knex";

export class KnexLocalLogRepository implements ILocalLogRepository {
    readonly database: Knex;

    public constructor(config: Knex.Config | undefined) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const configFile = require("../../../../../knex/knexfile.ts")[
            process.env.ENVIRONMENT || "development"
        ];
        
        this.database = knex(config || configFile)
    }

    getLogsTable(): Knex.QueryBuilder {
        return this.database("logs");
    }

    readById(logKey: string): Promise<IOdapLocalLog> {
        return this.getLogsTable()
            .where({ key: logKey })
            .first();
    }

    readLastestLog(sessionID: string): Promise<IOdapLocalLog> {
        return this.getLogsTable()
            .orderBy("timestamp", "desc")
            .where({ sessionID: sessionID })
            .first();
    }

    readLogsMoreRecentThanTimestamp(timestamp: string): Promise<IOdapLocalLog[]> {
        return this.getLogsTable()
            .where("timestamp", ">", timestamp)
            .whereNot("type", "like", "%proof%");
    }

    create(log: IOdapLocalLog): any {
       return this.getLogsTable().insert(log);
    }

    deleteBySessionId(sessionID: string): any {
        return this.database()
            .where({ sessionID: sessionID })
            .del();
    }

    readLogsNotProofs(): Promise<IOdapLocalLog[]> {
        return this.getLogsTable()
            .select(
                this.database.raw(
                    "sessionID, key, data, type, operation, MAX(timestamp) as timestamp",
                ),
            )
            .whereNot({ type: "proof" })
            .groupBy("sessionID");
    }

    async reset() {
        await this.database.migrate.rollback();
        await this.database.migrate.latest();
    }

    async destroy() {
        await this.database.destroy();
    }
}
