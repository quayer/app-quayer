import { igniter } from "@/igniter";
import { InstancesRepository } from "../repositories/instances.repository";
import { database } from "@/services/database";

/**
 * @typedef {object} InstancesContext
 * @property {object} features - Contexto de funcionalidades específicas
 * @property {object} features.instances - Contexto da funcionalidade de instâncias
 * @property {InstancesRepository} features.instances.repository - Repository de instâncias para operações de banco de dados
 */
export type InstancesContext = {
  features: {
    instances: {
      repository: InstancesRepository;
    };
  };
};

/**
 * @const instancesProcedure
 * @description Procedimento Igniter.js para injetar uma instância do InstancesRepository no contexto
 * Cria um padrão consistente: context.features.instances.repository
 * @returns {InstancesContext} Objeto contendo o repository de instâncias em estrutura hierárquica
 */
export const instancesProcedure = igniter.procedure({
  name: "instancesProcedure",
  handler: () => {
    // Context Extension: Instanciar InstancesRepository com o database importado diretamente
    const instancesRepository = new InstancesRepository(database);

    // Context Extension: Retornar a instância do repository em estrutura hierárquica para consistência
    return {
      features: {
        instances: {
          repository: instancesRepository,
        },
      },
    };
  },
});
