import { Zoomies } from "ldrs/react";
import "ldrs/react/Zoomies.css";

const CardLoader = () => {
  return (
    <div className="mt-[-15px] absolute top-0 left-0 w-full overflow-hidden">
      <Zoomies
        size={1400}
        stroke="3"
        bg-opacity="0.1"
        speed="1.4"
        color="hsl(var(--neutral-400))"
      />
    </div>
  );
};

export default CardLoader;
