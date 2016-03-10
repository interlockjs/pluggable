/*  eslint-disable no-magic-numbers */

import { default as pluggable, CONTINUE } from "../../src/pluggable";
import * as profiler from "../../src/profiler";


function buildContext (props = {}, override = {}, transform = {}) {
  return Object.assign({}, props, {
    __pluggables__: { override, transform }
  });
}


describe("pluggable", () => {
  it("should return a pluggable function", () => {
    const p = pluggable(() => {});
    expect(p)
      .to.be.a("function").and
      .to.have.property("__isPluggable__", true);
  });

  it("exposes original function for testing", () => {
    function thing () {}
    const p = pluggable(thing);
    expect(p.fn).to.equal(thing);
  });

  describe("function", () => {
    it("does not pollute base context when invoked", () => {
      const cxt = buildContext({ some: "val" });

      const p = pluggable(function fun () {
        this.some = "other-val";
        return this;
      });

      return p.call(cxt).then(innerCxt => {
        expect(innerCxt).to.have.property("some", "other-val");
        expect(cxt).to.have.property("some", "val");
      });
    });

    it("invokes overrides before the default function", () => {
      const pOverride = sinon.spy(() => CONTINUE);
      const pSpy = sinon.spy();
      const p = pluggable(function p () { pSpy(); });

      const cxt = buildContext({}, { p: [ pOverride ] });
      return p.call(cxt).then(() => {
        expect(pSpy).to.have.been.calledOnce;
        expect(pOverride)
          .to.have.been.calledOnce.and
          .to.have.been.calledBefore(pSpy);
      });
    });

    it("does not invoke the default function if other value is returned", () => {
      const pOverride = sinon.spy(() => {});
      const pSpy = sinon.spy();
      const p = pluggable(function p () { pSpy(); });

      const cxt = buildContext({}, { p: [ pOverride ] });
      return p.call(cxt).then(() => {
        expect(pSpy).not.to.have.been.calledOnce;
        expect(pOverride).to.have.been.calledOnce;
      });
    });

    it("invokes transforms after an override function", () => {
      const _child = sinon.spy(() => 5);
      const childOverride = sinon.spy(() => 10);
      const childTransform = sinon.spy((val) => val + 5);

      const child = pluggable(function child () { return _child(); });
      const parent = pluggable(function parent () {
        return this.child();
      }, { child });

      const cxt = buildContext({}, { child: [childOverride] }, { child: [childTransform] });
      return parent.call(cxt).then(val => {
        expect(_child).not.to.have.been.called;
        expect(childOverride).to.have.been.calledOnce;
        expect(childTransform)
          .to.have.been.calledOnce.and
          .to.have.been.calledAfter(childOverride).and
          .to.have.been.calledWith(10);
        expect(val).to.equal(15);
      });
    });

    it("invokes transforms after the default function", () => {
      const _child = sinon.spy(() => 5);
      const child = pluggable(function child () { return _child(); });
      const childTransform = sinon.spy((val) => val + 5);


      const parent = pluggable(function parent () {
        return this.child();
      }, { child });

      const cxt = buildContext({}, {}, { child: [childTransform] });
      return parent.call(cxt).then(val => {
        expect(_child).to.have.been.calledOnce;
        expect(childTransform)
          .to.have.been.calledOnce.and
          .to.have.been.calledAfter(_child).and
          .to.have.been.calledWith(5);
        expect(val).to.equal(10);
      });
    });

    it("invokes transforms with the result and args", () => {
      const childOverride = sinon.spy(arg => {
        expect(arg).to.equal(5);
        return 10;
      });

      const childTransform = sinon.spy((val, [arg]) => {
        expect(arg).to.equal(5);
        expect(val).to.equal(10);
        return val + 1;
      });

      const child = pluggable(function child () { return 1; });
      const parent = pluggable(function parent (arg) {
        return this.child(arg);
      }, { child });

      const cxt = buildContext({}, { child: [childOverride] }, { child: [childTransform] });
      return parent.call(cxt, 5).then(val => {
        expect(childOverride).to.have.been.calledOnce;
        expect(childTransform).to.have.been.calledOnce;
        expect(val).to.equal(11);
      });
    });

    it("invokes dependency-pluggables with same base context", () => {
      const cxt = buildContext({ expectedValue: true });

      const child = pluggable(function child () {
        expect(this).to.have.property("expectedValue", true);
      });

      const parent = pluggable(function parent () {
        expect(this).to.have.property("expectedValue", true);
        expect(this)
          .to.have.property("child").and
          .to.be.a("function");

        return this.child();
      }, { child });

      return parent.call(cxt);
    });

    it("invokes overrides with the same context as default", () => {
      const _child = sinon.spy();
      const childOverride = sinon.spy(function () {
        expect(this).to.have.property("expectedValue", true);
        expect(this).to.have.property("grandChild");
      });

      const grandChild = pluggable(function grandChild () {});
      const child = pluggable(function child () { _child(); }, { grandChild });
      const parent = pluggable(function parent () {
        return this.child();
      }, { child });

      const cxt = buildContext({ expectedValue: true }, { child: [ childOverride ]});
      return parent.call(cxt).then(() => {
        expect(_child).not.to.have.been.called;
        expect(childOverride).to.have.been.calledOnce;
      });
    });

    it("invokes transforms with the same context", () => {
      const _child = sinon.spy();
      const childTransform = sinon.spy(function () {
        expect(this).to.have.property("expectedValue", true);
        expect(this).to.have.property("grandChild");
      });

      const grandChild = pluggable(function grandChild () {});
      const child = pluggable(function child () { _child(); }, { grandChild });
      const parent = pluggable(function parent () {
        return this.child();
      }, { child });

      const cxt = buildContext({ expectedValue: true }, {}, { child: [ childTransform ]});
      return parent.call(cxt).then(() => {
        expect(_child).to.have.been.called;
        expect(childTransform).to.have.been.calledOnce;
      });
    });

    describe("when profiling is active", () => {
      let originalState;
      let sandbox;
      before(() => {
        sandbox = sinon.sandbox.create();
        originalState = profiler.PROFILER_ACTIVE;
        profiler.PROFILER_ACTIVE = true;
      });

      after(() => {
        sandbox.restore();
        profiler.PROFILER_ACTIVE = originalState;
      });

      it("logs pluggable invocation timing", () => {
        const concludeEvent = sinon.spy();
        const createEvent = sandbox.stub(profiler, "createEvent", fnName => {
          expect(fnName).to.match(/(child)|(parent)/);
          return concludeEvent;
        });

        const childOverride = sinon.spy(() => CONTINUE);
        const childTransform = sinon.spy(() => {
          expect(childOverride).to.have.been.calledOnce;
          expect(createEvent).to.have.been.calledTwice;
        });

        const child = pluggable(function child () {
          expect(createEvent)
            .to.have.been.calledTwice.and
            .to.have.been.calledWith("child");
        });

        const parent = pluggable(function parent () {
          expect(createEvent)
            .to.have.been.calledOnce.and
            .to.have.been.calledWith("parent");
          expect(concludeEvent).not.to.have.been.called;

          return this.child().then(() => {
            expect(concludeEvent).to.have.been.calledOnce;
          });
        }, { child });

        const cxt = buildContext(
          { some: "val" },
          { child: [childOverride] },
          { child: [childTransform] }
        );

        return parent.call(cxt).then(() => {
          expect(concludeEvent).to.have.been.calledTwice;
        });
      });
    });
  });
});
