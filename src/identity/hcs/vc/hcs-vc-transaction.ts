import { Client, Timestamp, TopicId, TopicMessageSubmitTransaction, Transaction, TransactionId } from "@hashgraph/sdk";
import moment from "moment";
import { ArraysUtils } from "../../../utils/arrays-utils";
import { Validator } from "../../../utils/validator";
import { VCError } from "../../vc-error";
import { MessageEnvelope } from "../message-envelope";
import { HcsVcMessage, Signer } from "./hcs-Vc-message";
import { HcsVcTopicListener } from "./hcs-Vc-topic-listener";

/**
 * The Vc document creation, update or deletion transaction.
 * Builds a correct {@link HcsVcMessage} and send it to HCS Vc topic.
 */
export class HcsVcTransaction {
    private static SUBTRACT_TIME = 1; // seconds

    protected topicId: TopicId;
    protected message: MessageEnvelope<HcsVcMessage>;

    private buildTransactionFunction: (input: TopicMessageSubmitTransaction) => Promise<Transaction>;
    private receiver: (input: MessageEnvelope<HcsVcMessage>) => void;
    private errorHandler: (input: Error) => void;
    private executed: boolean;
    private signer: Signer<Uint8Array>;
    private listener: HcsVcTopicListener;

    /**
     * Instantiates a new transaction object from a message that was already prepared.
     *
     * @param topicId The HCS Vc topic ID where message will be submitted.
     * @param message The message envelope.
     */
    constructor(message: MessageEnvelope<HcsVcMessage>, topicId: TopicId) {
        if (message instanceof MessageEnvelope && topicId instanceof TopicId) {
            this.topicId = topicId;
            this.message = message;
            this.executed = false;
        } else {
            throw new VCError("Invalid arguments");
        }
    }

    /**
     * Provides a {@link MessageListener} instance specific to the submitted message type.
     *
     * @param topicIdToListen ID of the HCS topic.
     * @return The topic listener for this message on a mirror node.
     */
    protected provideTopicListener(topicIdToListen: TopicId): HcsVcTopicListener {
        return new HcsVcTopicListener(topicIdToListen);
    }

    /**
     * Handles the error.
     * If external error handler is defined, passes the error there, otherwise raises RuntimeException.
     *
     * @param err The error.
     * @throws RuntimeException Runtime exception with the given error in case external error handler is not defined.
     */
    protected handleError(err: Error): void {
        if (this.errorHandler) {
            this.errorHandler(err);
        } else {
            throw new VCError(err.message);
        }
    }

    /**
     * Handles event from a mirror node when a message was consensus was reached and message received.
     *
     * @param receiver The receiver handling incoming message.
     * @return This transaction instance.
     */
    public onMessageConfirmed(receiver: (input: MessageEnvelope<HcsVcMessage>) => void): HcsVcTransaction {
        this.receiver = receiver;
        return this;
    }

    /**
     * Defines a handler for errors when they happen during execution.
     *
     * @param handler The error handler.
     * @return This transaction instance.
     */
    public onError(handler: (input: Error) => void): HcsVcTransaction {
        this.errorHandler = handler;
        return this;
    }

    /**
     * Defines a function that signs the message.
     *
     * @param signer The signing function to set.
     * @return This transaction instance.
     */
    public signMessage(signer: Signer<Uint8Array>): HcsVcTransaction {
        this.signer = signer;
        return this;
    }

    /**
     * Sets {@link TopicMessageSubmitTransaction} parameters, builds and signs it without executing it.
     * Topic ID and transaction message content are already set in the incoming transaction.
     *
     * @param builderFunction The transaction builder function.
     * @return This transaction instance.
     */
    public buildAndSignTransaction(
        builderFunction: (input: TopicMessageSubmitTransaction) => Promise<Transaction>
    ): HcsVcTransaction {
        this.buildTransactionFunction = builderFunction;
        return this;
    }

    /**
     * Builds the message and submits it to appnet's topic.
     *
     * @param client The hedera network client.
     * @return Transaction ID.
     */
    public async execute(client: Client): Promise<TransactionId> {
        new Validator().checkValidationErrors("MessageTransaction execution failed: ", (v) => {
            return this.validate(v);
        });

        const envelope = this.message;

        const messageContent = !envelope.getSignature()
            ? envelope.sign(this.signer)
            : ArraysUtils.fromString(envelope.toJSON());

        if (this.receiver) {
            this.listener = this.provideTopicListener(this.topicId);
            this.listener
                .setStartTime(Timestamp.fromDate(moment().subtract(HcsVcTransaction.SUBTRACT_TIME, "seconds").toDate()))
                .setIgnoreErrors(false)
                .addFilter((response) => {
                    return ArraysUtils.equals(messageContent, response.contents);
                })
                .onError((err) => {
                    return this.handleError(err);
                })
                .onInvalidMessageReceived((response, reason) => {
                    if (!ArraysUtils.equals(messageContent, response.contents)) {
                        return;
                    }

                    this.handleError(new VCError(reason + ": " + ArraysUtils.toString(response.contents)));
                    this.listener.unsubscribe();
                })
                .subscribe(client, (msg) => {
                    this.listener.unsubscribe();
                    this.receiver(msg);
                });
        }

        const tx = new TopicMessageSubmitTransaction().setTopicId(this.topicId).setMessage(messageContent);

        let transactionId;

        try {
            const response = await (await this.buildTransactionFunction(tx)).execute(client);
            await response.getReceipt(client);

            transactionId = response.transactionId;
            this.executed = true;
        } catch (e) {
            this.handleError(e);
            if (this.listener) {
                this.listener.unsubscribe();
            }
        }

        return transactionId;
    }

    /**
     * Runs validation logic.
     *
     * @param validator The errors validator.
     */
    protected validate(validator: Validator): void {
        validator.require(!this.executed, "This transaction has already been executed.");
        validator.require(
            !!this.signer || (!!this.message && !!this.message.getSignature()),
            "Signing function is missing."
        );
        validator.require(!!this.buildTransactionFunction, "Transaction builder is missing.");
    }
}
