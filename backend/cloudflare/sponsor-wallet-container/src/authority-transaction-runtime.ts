import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';

import type { SponsorWalletRuntime } from './wallet.js';
import type { SponsoredContractEntryPoint } from './transaction.js';

export interface AuthorityPreparedTransaction {
  contractTransactionId: string;
  transactionHash: string;
  feeSpecks: string;
  transactionBytes: number;
}

export interface AuthoritySubmission extends AuthorityPreparedTransaction {
  transactionId: string;
  blockHeight: string;
  replayRecovered: boolean;
}

export interface AuthorityTransactionRuntime {
  readonly shieldedSecretKeys: SponsorWalletRuntime['shieldedSecretKeys'];
  waitUntilReady(): Promise<void>;
  finalizeAuthorityTransaction(
    transaction: UnboundTransaction,
    ttl?: Date,
  ): Promise<FinalizedTransaction>;
  sponsorContractTransactionAndConfirm(
    transaction: FinalizedTransaction,
    contractAddress: string,
    expectedEntryPoint: SponsoredContractEntryPoint,
    operationId: string,
    onPrepared?: (prepared: AuthorityPreparedTransaction) => void | Promise<void>,
  ): Promise<AuthoritySubmission>;
}
