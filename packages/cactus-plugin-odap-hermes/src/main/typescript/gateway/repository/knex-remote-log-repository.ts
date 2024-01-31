import { IRemoteLogRepository } from "./interfaces/repository";
import { IOdapLogRemote } from "../plugin-odap-gateway";
import knex, { Knex } from "knex";
import path from "path";

export class KnexRemoteLogRepository implements IRemoteLogRepository {
    readonly database: Knex;

    // for now we will ignore the config because it needs to be static
    // so that both gateways can have access to the same database
    // simulating a remote log storage
    public constructor(config: Knex.Config | undefined) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const configFile = require("../../../knex/knexfile-remote.ts")[
            process.env.ENVIRONMENT || "development"
        ];
        
        this.database = knex(config || configFile)
    }

    getLogsTable(): Knex.QueryBuilder {
        return this.database("remote-logs");
    }

    readById(logKey: string): Promise<IOdapLogRemote> {        
        return this.getLogsTable()
            .where({ key: logKey })
            .first();
    }

    create(log: IOdapLogRemote): any {
        return this.getLogsTable().insert(log);
    }

    async reset() {
        await this.database.migrate.rollback();
        await this.database.migrate.latest();
    }

    async destroy() {
        await this.database.destroy();
    }
}