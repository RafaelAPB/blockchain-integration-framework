import { Knex } from "knex";
import { IOdapLogRemote, IOdapLocalLog } from "../../plugin-odap-gateway";

export interface IRepository<T, K> {
    readById(id: K): Promise<T>;
    create(entity: T): any;
}

export interface ILocalLogRepository extends IRepository<IOdapLocalLog, string> {
    database: any;
    readById(id: string): Promise<IOdapLocalLog>;
    readLogsNotProofs(): Promise<IOdapLocalLog[]>;
    readLogsMoreRecentThanTimestamp(timestamp: string): Promise<IOdapLocalLog[]>
    readLastestLog(sessionID: string): Promise<IOdapLocalLog>;
    create(log: IOdapLocalLog): Promise<IOdapLocalLog>;
    deleteBySessionId(log: string): any;
    destroy(): any;
    reset(): any;
}

export interface IRemoteLogRepository extends IRepository<IOdapLogRemote, string> {
    database: any;
    readById(id: string): Promise<IOdapLogRemote>;
    create(log: IOdapLogRemote): any;
    destroy(): any;
    reset(): any;
}