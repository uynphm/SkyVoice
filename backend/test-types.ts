import { InvokeModelWithBidirectionalStreamInput } from "@aws-sdk/client-bedrock-runtime";
const a: InvokeModelWithBidirectionalStreamInput = {
    body: (async function*() {
        yield { chunk: { bytes: new Uint8Array() } };
    })()
};
