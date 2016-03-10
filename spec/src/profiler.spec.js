/*  eslint-disable no-magic-numbers */

import Promise from "bluebird";

import * as profiler from "../../src/profiler";


const createEvent = profiler.createEvent;


describe("profiler", () => {
  beforeEach(() => {
    profiler.invocations.forEach(() => profiler.invocations.pop());
    profiler.invocations.length = 0;
  });

  describe("createEvent", () => {
    it("does not create an entry after event start", () => {
      createEvent("eventName");
      expect(profiler.invocations).to.have.length(0);
    });

    it("creates an entry after event start and end", () => {
      createEvent("eventName")();
      expect(profiler.invocations).to.have.length(1);
      expect(profiler.invocations[0]).to.have.property("name", "eventName");
      expect(profiler.invocations[0]).to.have.property("sec");
      expect(profiler.invocations[0]).to.have.property("nsec");
    });

    it("records the time it takes between event start and end", () => {
      const concludeEvent = createEvent("myEvent");
      return Promise.delay(500).then(() => {
        concludeEvent();
        expect(profiler.invocations).to.have.length(1);

        const event = profiler.invocations[0];
        expect(event.sec).to.equal(0);
        expect(Math.ceil(event.nsec / 1000000)).to.be.at.least(500);
      });
    });
  });
});
