import { MethodName, MethodParam, MethodResult } from "@connext/types";
import { Controller } from "rpc-server";

import { RequestHandler } from "../request-handler";

export abstract class NodeController extends Controller {
  public static readonly methodName: MethodName;

  public async executeMethod(
    requestHandler: RequestHandler,
    params: MethodParam,
  ): Promise<MethodResult> {
    await this.beforeExecution(requestHandler, params);

    const lockNames = await this.getRequiredLockNames(requestHandler, params);

    const createExecutionPromise = () => this.executeMethodImplementation(requestHandler, params);

    const ret = await requestHandler.processQueue.addTask(lockNames, createExecutionPromise);

    await this.afterExecution(requestHandler, params, ret);

    return ret;
  }

  protected abstract executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParam,
  ): Promise<MethodResult>;

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParam,
  ): Promise<void> {}

  protected async afterExecution(
    requestHandler: RequestHandler,
    params: MethodParam,
    returnValue: MethodResult,
  ): Promise<void> {}

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: MethodParam,
  ): Promise<string[]> {
    return [];
  }
}
