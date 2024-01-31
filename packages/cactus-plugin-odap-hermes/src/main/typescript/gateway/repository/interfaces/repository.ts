import { Knex } from "knex";
import { ISatpLogRemote, ISatpLocalLog } from "../../plugin-satp-gateway";

export interface IRepository<T, K> {
    readById(id: K): Promise<T>;
    create(entity: T): any;
}

export interface ILocalLogRepository extends IRepository<ISatpLocalLog, string> {
    database: any;
    readById(id: string): Promise<ISatpLocalLog>;
    readLogsNotProofs(): Promise<ISatpLocalLog[]>;
    readLogsMoreRecentThanTimestamp(timestamp: string): Promise<ISatpLocalLog[]>
    readLastestLog(sessionID: string): Promise<ISatpLocalLog>;
    create(log: ISatpLocalLog): Promise<ISatpLocalLog>;
    deleteBySessionId(log: string): any;
    destroy(): any;
    reset(): any;
}

export interface IRemoteLogRepository extends IRepository<ISatpLogRemote, string> {
    database: any;
    readById(id: string): Promise<ISatpLogRemote>;
    create(log: ISatpLogRemote): any;
    destroy(): any;
    reset(): any;
}